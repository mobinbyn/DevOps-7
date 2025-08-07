```bash
git clone https://github.com/csc-devops-s23/monitoring
```

```bash
docker run -dit --memory="1g" --cpus="1.0" --entrypoint sh --name server-01 --publish 4001:4001 --publish 5001:5001 node:alpine
docker exec -it server-01 sh
apk add git
```
```bash

git clone https://github.com/csc-devops-s23/monitoring
cd monitoring/agent && npm install
cd ../server && npm install
npm run start-agent
npm run start-server
```


