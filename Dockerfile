# Image du serveur de jeu (client + serveur temps réel).
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=optional --omit=dev
COPY shared ./shared
COPY server ./server
COPY client ./client
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server/index.js"]
