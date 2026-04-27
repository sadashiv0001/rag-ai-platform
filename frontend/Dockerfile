FROM node:20-alpine AS build
WORKDIR /app
COPY package.json vite.config.js /app/
COPY index.html /app/
COPY public /app/public
COPY src /app/src
RUN npm install
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80