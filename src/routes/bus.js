import express from 'express';
import axios from 'axios';
import cheerio from 'cheerio';
import https from 'https';
var iconv = require('iconv-lite');

const router = express.Router();

const BASE_URL = 'https://www.pjf.mg.gov.br';

const api = axios.create({
  // Configuration needed to avoid certificate problems
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  }),
  // The pjf site is using ISO-8859-1 so we need to convert it to UTF-8 later
  responseType: 'arraybuffer',
  reponseEncoding: 'binary'
});

api.interceptors.response.use(response => {
  let ctype = response.headers["content-type"];
  if (ctype.includes("charset=ISO-8859-1")) {
    response.data = iconv.decode(response.data, 'ISO-8859-1');
  }
  return response;
})

const scrape = async () => {
  const url = `${BASE_URL}/onibus/itinerario/index.php?psq_lin=num&psq_txtval=612`

  try {
    const responseAxios = await api.post(url);
    console.log(responseAxios.data);

    const $ = cheerio.load(responseAxios.data);

    // And here the game begins...

  } catch (error) {
    console.log(error);
  }
}

scrape();

// router.get('/', async (req, res) => {
//   try {
//     // To be continued...
//   } catch (err) {
//     return res.status(400).send({ errors: err.message });
//   }
// });

module.exports = app => app.use('/api/bus', router);