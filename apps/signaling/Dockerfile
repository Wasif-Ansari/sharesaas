FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --only=production

COPY . .

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {if(r.statusCode!==200) throw new Error(r.statusCode)})"

CMD ["node", "server.js"]
