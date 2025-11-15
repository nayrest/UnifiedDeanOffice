# Dockerfile
FROM node:20-alpine AS base

RUN apk add --no-cache python3 py3-pip gcc musl-dev python3-dev postgresql-dev

WORKDIR /app

# Копируем всё нужное
COPY package*.json ./
COPY requirements.txt ./
COPY . .

# Устанавливаем зависимости
RUN npm ci --omit=dev
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

ENV DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/unidecanat
ENV BOT_TOKEN=${BOT_TOKEN}

CMD ["node", "app/js/bot.js"]