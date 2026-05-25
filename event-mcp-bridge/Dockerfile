FROM node:20-slim

WORKDIR /app

# Оновлюємо сертифікати та додаємо базові утиліти
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Копіюємо package.json
COPY package*.json ./

# Використовуємо звичайний install, оскільки package-lock.json ще не існує
RUN npm install

# Копіюємо решту початкового коду мікросервісу
COPY . .

# Відкриваємо порт для зв'язку з C# бекендом
EXPOSE 5001

# Запуск нашого MCP-міст мікросервісу
CMD ["node", "index.js"]