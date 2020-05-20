import express from 'express';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import cheerio from 'cheerio';
import https from 'https';
var iconv = require('iconv-lite');
import { CronJob } from "cron";
import moment from "moment";
import 'moment/locale/pt-br';
moment.locale('pt-BR');
import { loadData, storeData } from "../../database/storage";

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

// Documentaion: https://github.com/kelektiv/node-cron#readme
// Scrape the schedules, create a backup and update the buses.json file
// Every saturday at 02:00 AM
const cronScrapeAndUpdate = new CronJob('00 00 02 * * 6', async () => {
  // const cronScrapeAndUpdate = new CronJob('10 50 19 * * *', async () => {
  const logDate = `----- ${new Date()} -----\r\n`;
  try {
    console.log("🤞 Scraping...", new Date());
    await scrape();
    console.log("✌️ That's all folks");

    const successes = fs.readFileSync(path.join(__dirname, "../../logs/successes.log"), "utf8");
    fs.writeFileSync(
      path.join(__dirname, "../../logs/successes.log"),
      successes + logDate + `Update success` + "\r\n\r\n"
    );
  } catch (error) {
    const errors = fs.readFileSync(path.join(__dirname, "../../logs/errors.log"), "utf8");
    fs.writeFileSync(
      path.join(__dirname, "../../logs/errors.log"),
      errors + logDate + error.message + "\r\n\r\n"
    );
  }
}, null, true, 'America/Sao_Paulo');

cronScrapeAndUpdate.start();

const scrape = async () => {
  try {
    const busNumbers = JSON.parse(
      loadData(path.join(__dirname, "../../database/numbers.json"))
    );

    const today = moment().format('YYYY-MM-DD');

    fs.copyFileSync(
      path.join(__dirname, "../../database/buses.json"),
      path.join(__dirname, `../../database/backups/buses-${today}.json`));

    storeData([], path.join(__dirname, `../../database/buses.json`));

    const newBuses = await Promise.all(busNumbers.map(async busNumber => {
      const url = `${BASE_URL}/onibus/itinerario/index.php?psq_lin=num&psq_txtval=${busNumber}`;

      const responseAxios = await api.post(url);
      const $ = cheerio.load(responseAxios.data);
      const name = $("#dados_linha .nome_bairro")
        .text()
        .replace(/\s\s+/g, " ")
        .trim();

      const number = $("#dados_linha #numero_linha")
        .text()
        .replace(/\s\s+/g, " ")
        .trim();

      let schedulesByDayType = [];
      let schedules = []
      let itinerary = [];
      $(`.quarto`).each((i, element) => {
        //Horários
        let header = [];
        if (element.children.length === 7) {
          element.children.forEach((item, index) => {
            if (cheerio.text($(item)).trim()) {
              if (item.children[0].name === 'span') {
                header = [];
                item.children.forEach(span => {
                  if (cheerio.text($(span)).trim()) {
                    header = [...header, cheerio.text($(span))];
                  }
                })
              } else if (item.children[0].name === 'tbody') {
                schedulesByDayType = [];
                //Each row of the schedule table
                item.children[0].children.forEach((row, iRow) => {
                  row.children.forEach((column, iColumn) => {
                    schedulesByDayType = [
                      ...schedulesByDayType,
                      {
                        index: `${iColumn}${iRow}`,
                        value: cheerio.text($(column))
                      }
                    ];
                  })
                })
                const orderedSchedules = schedulesByDayType.filter(f => f.value).sort(
                  (a, b) => a.index - b.index).map(item => item.value.trim());
                schedules = [
                  ...schedules,
                  {
                    dayType: header[0],
                    route: header[1],
                    schedule: orderedSchedules
                  }
                ]
              }
            }
          });
        }

        //Itinerário
        if (element.children.length === 13) {
          element.children.forEach((item, index) => {
            if (cheerio.text($(item)).trim()) {
              if (item.name === 'p') {
                itinerary = [...itinerary, cheerio.text($(item.children[0])).replace(/\n/g, '').split(',')];
              }
            }
          });
        }
      });

      itinerary = {
        departure: itinerary[0],
        return: itinerary[1]
      }

      const bus = {
        name,
        number,
        schedules,
        itinerary
      }

      console.log(`✅  ${number} - ${name}`);

      const buses = JSON.parse(
        loadData(path.join(__dirname, "../../database/buses.json"))
      );

      storeData(
        [...buses, bus],
        path.join(__dirname, "../../database/buses.json")
      );
      return bus;
    }));
    storeData({
      "lastUpdateDate": new Date().toISOString()
    }, path.join(__dirname, `../../database/lastUpdateDate.json`));
    return newBuses;
  } catch (error) {
    console.log(`❌  ${error}`);
  }
}

const checkUpdate = async lastUpdateDate => {
  const clientLastUpdateDate = new Date(lastUpdateDate || 0);
  const storage = await JSON.parse(
    loadData(path.join(__dirname, "../../database/lastUpdateDate.json"))
  );
  const serverLastUpdateDate = new Date(storage.lastUpdateDate);
  const needUpdate = serverLastUpdateDate.getTime() > clientLastUpdateDate.getTime();
  return needUpdate;
}

router.post('/checkUpdate', async (req, res) => {
  try {
    const { lastUpdateDate } = req.body;
    const needUpdate = await checkUpdate(lastUpdateDate);
    return res.status(200).send({ needUpdate });
  } catch (err) {
    return res.status(400).send({ error: err.message });
  }
});

router.post('/update', async (req, res) => {
  try {
    const { lastUpdateDate } = req.body;
    const needUpdate = await checkUpdate(lastUpdateDate);
    if (!needUpdate) throw new Error('Seus horários já estão atualizados');

    const buses = await JSON.parse(
      loadData(path.join(__dirname, "../../database/buses.json"))
    );

    return res.status(200).send({ buses });
  } catch (err) {
    return res.status(400).send({ error: err.message });
  }
});

module.exports = app => app.use('/api/bus', router);