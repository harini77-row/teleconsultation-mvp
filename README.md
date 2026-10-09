# TeleConsult — 1-to-1 WebRTC MVP

A minimal one-to-one browser teleconsultation prototype:
- WebRTC video + audio
- FastAPI WebSocket signaling
- maximum two participants per room
- mute/unmute
- camera on/off
- text chat
- peer leave handling
- responsive UI
- no recording

## Important
This is an MVP, **not a production healthcare system**. Room codes are not authentication.
Before real patient use, add authenticated users, appointment/object authorization, HTTPS/WSS,
short-lived room tokens, a production TURN service, audit controls, privacy/retention policy,
security testing, and appropriate legal/compliance review.

## Quick start with Docker

Requirements: Docker Desktop / Docker Engine + Compose.

```bash
docker compose up --build
```

Open:
- Frontend: http://localhost:3000
- Backend health: http://localhost:8000/health

Open the frontend in two browser windows and enter the same room code.

## Run without Docker

Backend:
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Testing on two physical devices
Browser camera/microphone APIs generally require a secure context. `localhost` is treated specially,
but another device opening a plain `http://<LAN-IP>:3000` may not get media access. For realistic
multi-device/remote testing, serve the frontend over HTTPS, signaling over WSS, and configure TURN.

## Production architecture next step
1. Authentication + patient/psychologist roles
2. Appointment-bound, short-lived consultation tokens
3. Server-side room authorization
4. TURN/coturn with ephemeral credentials
5. HTTPS/WSS
6. Waiting room/admit flow
7. Better ICE restart/reconnect handling
8. Device selector / pre-call test
9. Structured session documentation (separate module)
10. Automated browser/WebRTC/security tests

## Files
- `backend/main.py`: signaling server
- `frontend/app/page.tsx`: WebRTC client and UI
- `docker-compose.yml`: local two-service setup
