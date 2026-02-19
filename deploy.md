# Production Deployment

```bash
cd /opt/iTourTT
git pull origin main
docker compose up --build -d
docker compose exec backend npx prisma db push
```
