FROM node:20-slim

WORKDIR /app

# Оновлюємо сертифікати та додаємо базові утиліти
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Копіюємо файли конфігурації залежностей
COPY package*.json ./

# Встановлюємо залежності суворо без devDependencies (правильний прапор для Node 20)
RUN npm ci --omit=dev

# Копіюємо решту початкового коду мікросервісу
COPY . .

# Відкриваємо порт для зв'язку з C# бекендом
EXPOSE 5001

# Запуск нашого MCP-міст мікросервісу
CMD ["node", "index.js"]