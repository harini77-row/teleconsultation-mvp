import json
from collections import defaultdict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="1v1 Teleconsultation Signaling Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rooms = defaultdict(dict)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.websocket("/ws/{room_id}/{peer_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, peer_id: str):
    await websocket.accept()
    if len(rooms[room_id]) >= 2 and peer_id not in rooms[room_id]:
        await websocket.send_json({"type": "room-full"})
        await websocket.close()
        return

    rooms[room_id][peer_id] = websocket
    try:
        # Tell existing peer that a new peer arrived; new peer initiates offer.
        for other_id, other_ws in list(rooms[room_id].items()):
            if other_id != peer_id:
                await other_ws.send_json({"type": "peer-joined", "peerId": peer_id})
        await websocket.send_json({
            "type": "room-state",
            "peers": [p for p in rooms[room_id].keys() if p != peer_id]
        })

        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            data["from"] = peer_id
            # Relay to the other peer only.
            for other_id, other_ws in list(rooms[room_id].items()):
                if other_id != peer_id:
                    await other_ws.send_text(json.dumps(data))
    except WebSocketDisconnect:
        pass
    finally:
        rooms[room_id].pop(peer_id, None)
        for other_ws in list(rooms[room_id].values()):
            try:
                await other_ws.send_json({"type": "peer-left", "peerId": peer_id})
            except Exception:
                pass
        if not rooms[room_id]:
            rooms.pop(room_id, None)
