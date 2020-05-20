import express from 'express';
import path from 'path';
import axios from 'axios';
import cheerio from 'cheerio';
import https from 'https';
var iconv = require('iconv-lite');
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

const scrape = async () => {
  try {
    const oldBuses = JSON.parse(
      loadData(path.join(__dirname, "../../database/linhas.json"))
    );
    const busNumbers = oldBuses.map(bus => bus.number);

    console.log("🤞 Scraping...");
    const newBuses = await busNumbers.map(async busNumber => {
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
        loadData(path.join(__dirname, "../../database/buses-2020-05-19.json"))
      );

      storeData(
        [...buses, bus],
        path.join(__dirname, "../../database/buses-2020-05-19.json")
      );
      return bus;
    });
    return newBuses;
  } catch (error) {
    console.log(`❌  ${error}`);
  }
}

// router.get('/', async (req, res) => {
//   try {
//     // To be continued...
//   } catch (err) {
//     return res.status(400).send({ errors: err.message });
//   }
// });

module.exports = app => app.use('/api/bus', router);