FROM node:18-alpine

WORKDIR /app

# Copy package.json files
COPY package*.json ./
COPY packages/dashboard/package*.json ./packages/dashboard/
COPY packages/steps-track/package*.json ./packages/steps-track/

# Install dependencies
RUN npm install

# Copy source code
COPY packages/steps-track/dist ./packages/steps-track/dist
COPY packages/dashboard ./packages/dashboard

# Build the dashboard
RUN npm run build:dashboard

# Expose the port
EXPOSE 3000

# Set the command
CMD ["node", "packages/dashboard/dist/index.js"] 