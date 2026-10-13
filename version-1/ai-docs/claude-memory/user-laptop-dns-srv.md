---
name: user-laptop-dns-srv
description: "User's Windows laptop DNS (127.0.0.1) refuses SRV lookups, so mongodb+srv connections from local Node fail"
metadata:
  node_type: memory
  type: reference
  modified: 2026-10-13T08:18:48.781Z
---

On the user's laptop, Node's DNS server is 127.0.0.1 (likely a VPN/filter app) and it refuses SRV queries, so any local `mongodb+srv://` connection fails with `querySrv ECONNREFUSED` even though Vercel connects fine.

Workaround that worked for `npm run seed` (2026-10-13), run from `backend/`:
`node -e "require('dns').setServers(['8.8.8.8','1.1.1.1']); require('./seed.js')"`

Permanent fix would be pausing the filtering app or setting Windows DNS to 8.8.8.8/1.1.1.1. Related: [[vit-hostel-deployment]].
