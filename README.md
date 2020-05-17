# api-jfbus

API with bus schedules from Juiz de Fora - MG

#### What do I have to do?

- Run `yarn` or `npm install`
- Run `yarn start` or `npm start`
- Now the API is up and running on port **3333**

##### Running in production with [PM2](https://pm2.keymetrics.io/)
- Install PM2 globally `npm install pm2 -g`
- Run `pm2 start ecosystem.config.js`
 
The API is not finished but it does the most important things:

- It has a database (a json file, not good but...);
- Search route by number or name;
- Search route by id;
