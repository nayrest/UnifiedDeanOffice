# Единый деканат 24/7 — Чат-бот для студентов и деканата

Умный чат-бот, который работает круглосуточно и помогает:
- студентам быстро подавать любые заявки
- деканату обрабатывать их в одном месте
- делать рассылки всем студентам
- видеть заявки на перезвон

Всё в одном Docker-контейнере — развернул и работает.

## Что умеет бот

### Для студентов
- Подать заявку одной кнопкой или текстом  
  Пример: `справка: нужна в военкомат`
- Запросить перезвон из деканата
- Посмотреть свои заявки

### Для сотрудников деканата
- Видеть все заявки с фильтрами (новые / в работе / выполненные)
- Брать заявку в работу, отмечать выполненной или отклонять
- Делать рассылку всем студентам (с фото/документами)
- Просматривать запросы на перезвон

### Для администратора
- Назначать роли: `/role 123456789 dekanat`

## Как запустить

### Вариант 1 — самый простой (через готовый образ)

```bash
docker run -d \
  --name deanbot-max \
  --restart unless-stopped \
  -e BOT_TOKEN=f9LHodD0cOIFQ6lJYInk7YBXD9LGp50hMk6tz6ITyAhyD5H7Lc_a0_5_hLW5gz7FWCaxyoRsueH2x4LW4F1X \
  -e POSTGRES_PASSWORD=postgres \
  nayrest/deanbot-max:latest

```
### Вариант 2 — собрать локально из кода

```bash
git clone https://github.com/nayrest/UnifiedDeanOffice.git
cd UnifiedDeanOffice

cp .env.example .env

docker compose up -d --build
```

### Вариант 3 — собрать и запустить вручную

docker build -t deanbot-max .

```bash
docker run -d \
  --name deanbot-max \
  --restart unless-stopped \
  -e BOT_TOKEN=f9LHodD0cOIFQ6lJYInk7YBXD9LGp50hMk6tz6ITyAhyD5H7Lc_a0_5_hLW5gz7FWCaxyoRsueH2x4LW4F1X \
  -e POSTGRES_PASSWORD=12345 \
  deanbot-max
  ```