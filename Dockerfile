FROM node:16

# Prepare packages
RUN apt-get update -q && apt-get install -y bluetooth bluez libbluetooth-dev libudev-dev \
    build-essential libssl-dev

# Prepare NodeJS - Use `n` package to downgrade NodeJS
RUN npm install -g n && \
    n 8

RUN node --version

# Get code
RUN cd ~ && git clone https://github.com/xsens/xsens_dot_server.git

WORKDIR /root/xsens_dot_server

# Run application
RUN npm install

EXPOSE 8080

CMD ["node", "xsensDotServer"]
