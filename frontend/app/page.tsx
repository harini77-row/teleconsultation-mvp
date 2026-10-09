"use client";

import { useEffect, useRef, useState } from "react";

const TURN_USERNAME = "aa96075ef8356991d1c0cb24";
const TURN_PASSWORD = "s4LFiOtRwFxkG317";

const ICE_SERVERS: RTCIceServer[] = [
  {
    urls: "stun:stun.relay.metered.ca:80",
  },
  {
    urls: "turn:asia.relay.metered.ca:80",
    username: TURN_USERNAME,
    credential: TURN_PASSWORD,
  },
  {
    urls: "turn:asia.relay.metered.ca:80?transport=tcp",
    username: TURN_USERNAME,
    credential: TURN_PASSWORD,
  },
  {
    urls: "turn:asia.relay.metered.ca:443",
    username: TURN_USERNAME,
    credential: TURN_PASSWORD,
  },
  {
    urls: "turns:asia.relay.metered.ca:443?transport=tcp",
    username: TURN_USERNAME,
    credential: TURN_PASSWORD,
  },
];

function createPeerId() {
  return `peer-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function getWebSocketBase() {
  if (typeof window === "undefined") {
    return "ws://localhost:8000";
  }

  const hostname = window.location.hostname;

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  ) {
    return "ws://localhost:8000";
  }

  return (
    process.env.NEXT_PUBLIC_WS_URL ||
    "wss://teleconsult-backend-fgpg.onrender.com"
  );
}

export default function Home() {
  const [room, setRoom] = useState("");
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState("Ready");

  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  const [messages, setMessages] = useState<string[]>([]);
  const [msg, setMsg] = useState("");

  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);

  const localStream = useRef<MediaStream | null>(null);

  const pc = useRef<RTCPeerConnection | null>(null);
  const ws = useRef<WebSocket | null>(null);

  const peerId = useRef<string>("");

  useEffect(() => {
    peerId.current = createPeerId();

    return () => {
      ws.current?.close();
      pc.current?.close();

      localStream.current?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);

  useEffect(() => {
    if (
      joined &&
      localVideo.current &&
      localStream.current
    ) {
      localVideo.current.srcObject = localStream.current;

      localVideo.current.play().catch((error) => {
        console.warn(
          "Local video playback could not start:",
          error
        );
      });
    }
  }, [joined]);

  async function ensureMedia() {
    if (localStream.current) {
      return localStream.current;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera/microphone unavailable. Use HTTPS or localhost."
      );
    }

    const stream =
      await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

    localStream.current = stream;

    const audioTracks = stream.getAudioTracks();
    const videoTracks = stream.getVideoTracks();

    setMicEnabled(
      audioTracks.length > 0 && audioTracks[0].enabled
    );

    setCameraEnabled(
      videoTracks.length > 0 && videoTracks[0].enabled
    );

    if (localVideo.current) {
      localVideo.current.srcObject = stream;

      try {
        await localVideo.current.play();
      } catch (error) {
        console.warn(
          "Local preview playback delayed:",
          error
        );
      }
    }

    return stream;
  }

  function createPC() {
    if (pc.current) {
      return pc.current;
    }

    const connection = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    });

    if (localStream.current) {
      localStream.current
        .getTracks()
        .forEach((track) => {
          connection.addTrack(
            track,
            localStream.current!
          );
        });
    }

    connection.ontrack = (event) => {
      if (!remoteVideo.current) {
        return;
      }

      const stream = event.streams[0];

      if (!stream) {
        return;
      }

      remoteVideo.current.srcObject = stream;

      remoteVideo.current.play().catch((error) => {
        console.warn(
          "Remote video playback delayed:",
          error
        );
      });
    };

    connection.onicecandidate = (event) => {
      if (
        event.candidate &&
        ws.current?.readyState === WebSocket.OPEN
      ) {
        ws.current.send(
          JSON.stringify({
            type: "ice",
            candidate: event.candidate,
          })
        );
      }
    };

    connection.oniceconnectionstatechange = () => {
      console.log(
        "ICE connection state:",
        connection.iceConnectionState
      );
    };

    connection.onconnectionstatechange = () => {
      console.log(
        "WebRTC connection state:",
        connection.connectionState
      );

      switch (connection.connectionState) {
        case "connected":
          setStatus("Call: connected");
          break;

        case "connecting":
          setStatus("Call: connecting...");
          break;

        case "disconnected":
          setStatus("Call: disconnected");
          break;

        case "failed":
          setStatus("Call: connection failed");
          break;

        case "closed":
          setStatus("Call ended");
          break;
      }
    };

    pc.current = connection;

    return connection;
  }

  async function makeOffer() {
    const connection = createPC();

    const offer = await connection.createOffer();

    await connection.setLocalDescription(offer);

    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: "offer",
          sdp: connection.localDescription,
        })
      );
    }
  }

  async function join() {
    const cleanRoom = room.trim();

    if (!cleanRoom) {
      setStatus("Enter a room code.");
      return;
    }

    try {
      setStatus(
        "Requesting camera and microphone..."
      );

      await ensureMedia();

      if (!peerId.current) {
        peerId.current = createPeerId();
      }

      const websocketBase = getWebSocketBase();

      console.log(
        "Connecting to signaling server:",
        websocketBase
      );

      const socket = new WebSocket(
        `${websocketBase}/ws/${encodeURIComponent(
          cleanRoom
        )}/${encodeURIComponent(peerId.current)}`
      );

      ws.current = socket;

      socket.onopen = () => {
        setJoined(true);

        setStatus(
          "Waiting for the other participant..."
        );
      };

      socket.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "room-full") {
            setStatus(
              "Room is full. Maximum 2 participants."
            );

            socket.close();
            return;
          }

          if (
            data.type === "room-state" &&
            data.peers?.length
          ) {
            await makeOffer();
            return;
          }

          if (data.type === "offer") {
            const connection = createPC();

            await connection.setRemoteDescription(
              new RTCSessionDescription(data.sdp)
            );

            const answer =
              await connection.createAnswer();

            await connection.setLocalDescription(
              answer
            );

            socket.send(
              JSON.stringify({
                type: "answer",
                sdp: connection.localDescription,
              })
            );

            return;
          }

          if (data.type === "answer") {
            if (pc.current) {
              await pc.current.setRemoteDescription(
                new RTCSessionDescription(
                  data.sdp
                )
              );
            }

            return;
          }

          if (
            data.type === "ice" &&
            data.candidate
          ) {
            if (pc.current) {
              try {
                await pc.current.addIceCandidate(
                  new RTCIceCandidate(
                    data.candidate
                  )
                );
              } catch (error) {
                console.warn(
                  "Could not add ICE candidate:",
                  error
                );
              }
            }

            return;
          }

          if (data.type === "chat") {
            setMessages((current) => [
              ...current,
              `Other: ${data.text}`,
            ]);

            return;
          }

          if (data.type === "peer-left") {
            setStatus(
              "Other participant left."
            );

            if (remoteVideo.current) {
              remoteVideo.current.srcObject = null;
            }

            pc.current?.close();
            pc.current = null;
          }
        } catch (error) {
          console.error(
            "Signaling message error:",
            error
          );
        }
      };

      socket.onerror = (error) => {
        console.error(
          "WebSocket error:",
          error
        );

        setStatus(
          "Could not connect to signaling server."
        );
      };

      socket.onclose = () => {
        setStatus((current) => {
          if (
            current.includes("full") ||
            current === "Call ended" ||
            current ===
              "Other participant left."
          ) {
            return current;
          }

          return "Signaling disconnected";
        });
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Camera/microphone error";

      setStatus(`Could not start: ${message}`);
    }
  }

  function toggleMic() {
    const stream = localStream.current;

    if (!stream) {
      return;
    }

    const tracks = stream.getAudioTracks();

    if (tracks.length === 0) {
      setStatus(
        "No microphone track available."
      );

      return;
    }

    const newEnabled = !tracks[0].enabled;

    tracks.forEach((track) => {
      track.enabled = newEnabled;
    });

    setMicEnabled(newEnabled);
  }

  function toggleCamera() {
    const stream = localStream.current;

    if (!stream) {
      return;
    }

    const tracks = stream.getVideoTracks();

    if (tracks.length === 0) {
      setStatus(
        "No camera track available."
      );

      return;
    }

    const newEnabled = !tracks[0].enabled;

    tracks.forEach((track) => {
      track.enabled = newEnabled;
    });

    setCameraEnabled(newEnabled);
  }

  function sendChat() {
    const text = msg.trim();

    if (!text) {
      return;
    }

    if (
      ws.current?.readyState !== WebSocket.OPEN
    ) {
      setStatus(
        "Chat unavailable: signaling disconnected."
      );

      return;
    }

    ws.current.send(
      JSON.stringify({
        type: "chat",
        text,
      })
    );

    setMessages((current) => [
      ...current,
      `You: ${text}`,
    ]);

    setMsg("");
  }

  function leave() {
    if (
      ws.current &&
      ws.current.readyState === WebSocket.OPEN
    ) {
      ws.current.close();
    }

    pc.current?.close();

    localStream.current
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    localStream.current = null;
    pc.current = null;
    ws.current = null;

    if (localVideo.current) {
      localVideo.current.srcObject = null;
    }

    if (remoteVideo.current) {
      remoteVideo.current.srcObject = null;
    }

    peerId.current = createPeerId();

    setMicEnabled(true);
    setCameraEnabled(true);

    setJoined(false);
    setStatus("Call ended");

    setMessages([]);
    setMsg("");
  }

  return (
    <main>
      <header>
        <div>
          <b>TeleConsult</b>

          <span>
            1-to-1 secure video consultation MVP
          </span>
        </div>

        <div className="badge">
          {status}
        </div>
      </header>

      {!joined ? (
        <section className="join card">
          <h1>
            Start a consultation
          </h1>

          <p>
            Enter the same room code on two
            browsers or devices.
          </p>

          <label>
            Room code
          </label>

          <input
            value={room}
            onChange={(event) =>
              setRoom(event.target.value)
            }
            placeholder="e.g. session-4821"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                join();
              }
            }}
          />

          <button onClick={join}>
            Join consultation
          </button>

          <small>
            Prototype only. Room codes are not
            authentication. Add user and appointment
            authorization before healthcare deployment.
          </small>
        </section>
      ) : (
        <section className="call">
          <div className="videos">

            <div className="videoBox remote">
              <video
                ref={remoteVideo}
                autoPlay
                playsInline
              />

              <span>
                Other participant
              </span>
            </div>

            <div className="videoBox local">
              <video
                ref={localVideo}
                autoPlay
                muted
                playsInline
              />

              <span>
                You
                {!micEnabled
                  ? " • Muted"
                  : ""}
                {!cameraEnabled
                  ? " • Camera off"
                  : ""}
              </span>
            </div>
          </div>

          <aside className="card chat">
            <h2>
              Consultation chat
            </h2>

            <div className="msgs">
              {messages.length ? (
                messages.map(
                  (message, index) => (
                    <p key={index}>
                      {message}
                    </p>
                  )
                )
              ) : (
                <em>
                  No messages yet.
                </em>
              )}
            </div>

            <div className="send">
              <input
                value={msg}
                onChange={(event) =>
                  setMsg(
                    event.target.value
                  )
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter"
                  ) {
                    sendChat();
                  }
                }}
                placeholder="Type a message"
              />

              <button
                onClick={sendChat}
              >
                Send
              </button>
            </div>
          </aside>

          <nav className="controls">
            <button
              onClick={toggleMic}
              aria-pressed={!micEnabled}
            >
              {micEnabled
                ? "🎤 Mute"
                : "🔇 Unmute"}
            </button>

            <button
              onClick={toggleCamera}
              aria-pressed={!cameraEnabled}
            >
              {cameraEnabled
                ? "📹 Camera off"
                : "📷 Camera on"}
            </button>

            <button
              className="danger"
              onClick={leave}
            >
              Leave call
            </button>
          </nav>
        </section>
      )}

      <footer>
        WebRTC media • WebSocket signaling •
        No recording
      </footer>
    </main>
  );
}