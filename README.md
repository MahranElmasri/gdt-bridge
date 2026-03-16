# GDT Bridge Agent — MVZ El-Sharafi

Polls your web forms API for pending GDT files and drops them into the
Medical Office (indmed) import folder every 10 seconds.

---

## Files

| File | Purpose |
|---|---|
| `bridge.js` | Main agent — run this |
| `service-install.js` | Install as Windows Service (run once as Admin) |
| `service-uninstall.js` | Remove Windows Service |
| `api-server-stub.js` | Example API server (plug into your backend) |
| `.env.example` | Configuration template |

---

## Setup on the Windows PVS PC

### 1. Install Node.js
Download from https://nodejs.org — use the LTS version (v18 or later).

### 2. Copy this folder to the PC
Place it somewhere stable, e.g.:
```
C:\GDT-Bridge\
```

### 3. Install dependencies
Open PowerShell in the folder and run:
```powershell
npm install
```

### 4. Create your .env file
```powershell
copy .env.example .env
```
Then edit `.env` and fill in:
- `API_BASE_URL` — your web forms server URL
- `API_KEY` — shared secret between bridge and server
- `GDT_IMPORT_DIR` — must match the path set in MO Datenpflegesystem

### 5. Test manually first
```powershell
node bridge.js
```
You should see:
```
[2026-03-16 10:00:00] [INFO ] GDT Bridge Agent starting...
[2026-03-16 10:00:00] [OK   ] Startup OK — polling started
```
Drop a .gdt file into your API queue and watch it appear in the import folder.

### 6. Install as a Windows Service (run as Administrator)
```powershell
node service-install.js
```
The service "GDT Bridge Agent" will now:
- Start automatically on Windows boot
- Restart itself if it crashes
- Run in the background with no console window

### 7. Manage the service
```powershell
# Check status
sc query "GDT Bridge Agent"

# Stop
net stop "GDT Bridge Agent"

# Start
net start "GDT Bridge Agent"

# Uninstall
node service-uninstall.js
```

---

## Logs

Bridge activity is logged to `bridge.log` in the same folder.
Tail it in PowerShell:
```powershell
Get-Content bridge.log -Wait
```

---

## API contract

The bridge expects two endpoints on your server:

### GET /api/gdt/pending
Returns an array of GDT files ready for import:
```json
[
  {
    "id": "abc123",
    "filename": "Doe_John_ANM_1710580000000.gdt",
    "content": "<GDT file content as Latin-1 string or base64>"
  }
]
```

### POST /api/gdt/delivered/:id
Called after the file is written to disk. Marks it as delivered so it
won't be returned again. Returns `{ "ok": true }`.

See `api-server-stub.js` for a full working example to plug into your backend.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Import folder does not exist" | Bridge creates it automatically — check Windows permissions |
| Files appear but MO ignores them | Check Dateiserverdienst is running in MO Datenpflegesystem |
| "Patient nicht gefunden" in MO | Name/DOB in GDT doesn't match the MO patient record |
| HTTP 401 from API | Check API_KEY in .env matches the server |
| Service won't start | Run `node bridge.js` manually to see the error |
