# client/Dockerfile — Production static build served by nginx
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Build args passed at docker build time
ARG VITE_API_URL
ARG VITE_SOCKET_URL
ARG VITE_APP_NAME=CamWatch
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# SPA routing — all paths serve index.html
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
