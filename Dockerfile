# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# Install dependencies (including devDeps for the Tailwind build)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Build the Tailwind stylesheet into public/styles.css
RUN npm run build:css

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/server.js"]
