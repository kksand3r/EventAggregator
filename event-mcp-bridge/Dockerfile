FROM node:20-slim

WORKDIR /app

# Оновлюємо сертифікати та додаємо базові утиліти про всяк випадок
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Копіюємо файли конфігурації залежностей
COPY package*.json ./

# Встановлюємо залежності суворо за lock-файлом для виробничого середовища
RUN npm ci --only=production

# Копіюємо решту початкового коду мікросервісу
COPY . .

# Відкриваємо порт для зв'язку з C# бекендом
EXPOSE 5001

# Запуск нашого MCP-міст мікросервісу
CMD ["node", "index.js"]