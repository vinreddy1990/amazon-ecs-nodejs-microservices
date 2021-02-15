FROM 923654168085.dkr.ecr.us-east-1.amazonaws.com/alpine:latest

WORKDIR /srv
ADD . .
RUN npm install

EXPOSE 3000
CMD ["node", "server.js"]
