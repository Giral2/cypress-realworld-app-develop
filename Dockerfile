FROM node:22-bookworm-slim

WORKDIR /app

# Desactivar instalación del binario de Cypress en la imagen de ejecución y evitar errores de Husky
ENV CYPRESS_INSTALL_BINARY=0
ENV HUSKY=0
ENV NODE_ENV=development

# Copiar archivos de dependencias y parches
COPY package.json yarn.lock .yarnrc ./
COPY patches/ ./patches/

# Instalar dependencias
RUN yarn install --frozen-lockfile

# Copiar todo el código fuente del proyecto
COPY . .

# Inicializar los datos de prueba / base de datos JSON
RUN yarn db:seed:dev

# Exponer puertos del Frontend (3000) y Backend (3001)
EXPOSE 3000
EXPOSE 3001

# Iniciar frontend (Vite) y backend (Express) en paralelo
CMD ["yarn", "dev"]
