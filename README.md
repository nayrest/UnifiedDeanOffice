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

#### Linux

```bash
docker pull nayrest/unifieddeanoffice:latest
cp .env.example .env
docker compose up -d 
docker logs unifieddeanoffice-bot-1 -f
```

#### Windows (PowerShell)
```bash
docker pull nayrest/unifieddeanoffice:latest
Copy-Item .env.example .env
docker compose up -d
docker logs unifieddeanoffice-bot-1 -f

```

#### Windows (Command Line)
```bash
docker pull nayrest/unifieddeanoffice:latest
copy .env.example .env
docker compose up -d
docker logs unifieddeanoffice-bot-1 -f
```

### Вариант 2 — собрать локально из кода

#### Linux

```bash
git clone https://github.com/nayrest/UnifiedDeanOffice.git
cd UnifiedDeanOffice
cp .env.example .env
docker compose up -d --build
docker logs unifieddeanoffice-bot-1 -f
```
#### Windows (PowerShell)
```bash
git clone https://github.com/nayrest/UnifiedDeanOffice.git
cd UnifiedDeanOffice
Copy-Item .env.example .env
docker compose up -d --build
docker logs unifieddeanoffice-bot-1 -f
```

#### Windows (Command Line)
```bash
git clone https://github.com/nayrest/UnifiedDeanOffice.git
cd UnifiedDeanOffice
copy .env.example .env
docker compose up -d --build
docker logs unifieddeanoffice-bot-1 -f
```