# Production Deployment

```bash
cd /root/iTourTT
git pull origin main
docker compose up --build -d
docker compose exec backend npx prisma db push
```
