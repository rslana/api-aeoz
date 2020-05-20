import express from "express";
import path from 'path';
import axios from "axios";
import cheerio from "cheerio";
import fs from "fs";

const router = express.Router();

const BASE_URL = "http://www.astransp.com.br/buscaLinhas.aspx";

router.get("/linhas/search/:strSearch", async (req, res) => {
  const { strSearch } = req.params;
  if (strSearch) {
    const linhas = await JSON.parse(
      loadData(path.join(__dirname, "../database/linhas.json"))
    );

    let linhasResult = [];

    if (!isNaN(strSearch)) {
      linhasResult = await linhas.filter(
        linha => linha.number.indexOf(strSearch) >= 0
      );
    } else {
      linhasResult = await linhas.filter(
        linha => linha.name.toLowerCase().indexOf(strSearch.toLowerCase()) >= 0
      );
    }
    return res.send({ linhas: linhasResult });
  }
  return res.send({ linhas: [] });
});

router.get("/linhas/all", async (req, res) => {
  const linhas = await JSON.parse(
    loadData(path.join(__dirname, "../../database/linhas.json"))
  );
  return res.send({ linhas });
});

router.get("/linha/:id", async (req, res) => {
  const linhas = await JSON.parse(
    loadData(path.join(__dirname, "../database/linhas.json"))
  );

  const linha = await linhas.find(linha => linha._id === req.params.id);

  return res.send({ linha });
});

/*
  The ids goes from 1 to 266
  Generates the data from linhas.json
  A cronjob will be used to update the data automatically every week or month
  You don't have to execute because the linhas.json is already populated
*/
async function updateDatabase() {
  const ID_LIMIT = 266;
  console.log("🤞 Scraping...");
  for (let id = 1; id <= ID_LIMIT; id++) {
    const options = {
      url: `${BASE_URL}?IDLinha=${id}`,
      headers: {
        "User-Agent": "request",
        "Accept-Charset": "text/html; charset=utf-8",
        "Content-Type": "text/html; charset=utf-8"
      }
    };

    const respAxios = await axios.get(options.url, options);

    const $ = cheerio.load(respAxios.data);
    let horario = {
      ida: {
        diasUteis: [],
        sabados: [],
        domingosFeriados: []
      },
      volta: {
        diasUteis: [],
        sabados: [],
        domingosFeriados: []
      }
    };
    const hoje = new Date();
    const IDS = [
      { ida: { diasUteis: "ctl00_ContentPlaceHolder1_dtlDiasUteisSd1" } },
      { ida: { sabados: "ctl00_ContentPlaceHolder1_dtlSabadoSd1" } },
      { ida: { domingosFeriados: "ctl00_ContentPlaceHolder1_dtlDomingoSd1" } },
      { volta: { diasUteis: "ctl00_ContentPlaceHolder1_dtlDiaUtilSd2" } },
      { volta: { sabados: "ctl00_ContentPlaceHolder1_dtlSabadoSd2" } },
      { volta: { domingosFeriados: "ctl00_ContentPlaceHolder1_dtlDomingoSd2" } }
    ];

    const number = $("#ctl00_ContentPlaceHolder1_lblNumeroLinha")
      .text()
      .replace(/\s\s+/g, " ")
      .trim();
    const name = $("#ctl00_ContentPlaceHolder1_lblNomeLinha")
      .text()
      .replace(/\s\s+/g, " ")
      .trim();
    const link = $("form")
      .attr("action")
      .replace(/\s\s+/g, " ")
      .trim();

    if (number && name) {
      IDS.forEach(ID => {
        const sentido = Object.keys(ID)[0];
        const tipoDia = Object.keys(ID[sentido])[0];

        $(`#${ID[sentido][tipoDia]} td`).each((i, element) => {
          const horas = $(element)
            .text()
            .split(":");
          const data = new Date(hoje.setHours(horas[0])).setMinutes(horas[1]);
          const time = new Date(data).getTime();
          if (!isNaN(time)) {
            horario[sentido][tipoDia] = [...horario[sentido][tipoDia], time];
          }
        });
        horario[sentido][tipoDia].sort();
        horario[sentido][tipoDia] = horario[sentido][tipoDia].map(h => {
          const data = new Date(h);
          const horas =
            data.getHours() < 10 ? `0${data.getHours()}` : data.getHours();
          const minutos =
            data.getMinutes() < 10
              ? `0${data.getMinutes()}`
              : data.getMinutes();
          return `${horas}:${minutos}`;
        });

        //Places the schedules from 00:00 to 01:59 at the end of the list
        if (horario[sentido][tipoDia][0]) {
          while (parseInt(horario[sentido][tipoDia][0].substr(0, 2)) <= 1) {
            const primeiro = horario[sentido][tipoDia].shift();
            horario[sentido][tipoDia] = [
              ...horario[sentido][tipoDia],
              primeiro
            ];
          }
        }
      });

      const itinerario = {
        ida: [],
        volta: []
      };

      $(`#ctl00_ContentPlaceHolder1_lblItinerario`).each((i, element) => {
        const divItinerario = $(element)
          .text()
          .split("VOLTA:");

        const ida = divItinerario[0]
          .replace("IDA:", "")
          .trim()
          .split(",");
        const volta = divItinerario[1].trim().split(",");

        itinerario.ida = ida;
        itinerario.volta = volta;
      });

      const linha = {
        _id: link.toLowerCase().split("idlinha=")[1],
        number,
        name,
        horario,
        itinerario
      };

      console.log(`✔️  ID: ${id} - NUMBER: ${number}`);

      const linhas = JSON.parse(
        loadData(path.join(__dirname, "../database/linhas.json"))
      );

      storeData(
        [...linhas, linha],
        path.join(__dirname, "../database/linhas.json")
      );
    } else {
      console.log(`❌  ID: ${id} - There is no name or number`);
    }
  }
  console.log("👍  DONE!");
}

const storeData = (data, path) => {
  try {
    fs.writeFileSync(path, JSON.stringify(data));
  } catch (err) {
    console.error(err);
  }
};

const loadData = path => {
  try {
    return fs.readFileSync(path, "utf8");
  } catch (err) {
    console.error(err);
    return false;
  }
};

router.get("/linha/:id", async (req, res) => {
  const id = req.params.id;

  const options = {
    url: `${BASE_URL}?IDLinha=${id}`,
    headers: {
      "User-Agent": "request",
      "Accept-Charset": "text/html; charset=utf-8",
      "Content-Type": "text/html; charset=utf-8"
    }
  };

  const respAxios = await axios.get(options.url, options);
  const $ = cheerio.load(respAxios.data);
  let horario = {
    ida: {
      diasUteis: [],
      sabados: [],
      domingosFeriados: []
    },
    volta: {
      diasUteis: [],
      sabados: [],
      domingosFeriados: []
    }
  };
  const hoje = new Date();
  const IDS = [
    { ida: { diasUteis: "ctl00_ContentPlaceHolder1_dtlDiasUteisSd1" } },
    { ida: { sabados: "ctl00_ContentPlaceHolder1_dtlSabadoSd1" } },
    { ida: { domingosFeriados: "ctl00_ContentPlaceHolder1_dtlDomingoSd1" } },
    { volta: { diasUteis: "ctl00_ContentPlaceHolder1_dtlDiaUtilSd2" } },
    { volta: { sabados: "ctl00_ContentPlaceHolder1_dtlSabadoSd2" } },
    { volta: { domingosFeriados: "ctl00_ContentPlaceHolder1_dtlDomingoSd2" } }
  ];

  const number = $("#ctl00_ContentPlaceHolder1_lblNumeroLinha")
    .text()
    .replace(/\s\s+/g, " ")
    .trim();
  const name = $("#ctl00_ContentPlaceHolder1_lblNomeLinha")
    .text()
    .replace(/\s\s+/g, " ")
    .trim();
  const link = $("form")
    .attr("action")
    .replace(/\s\s+/g, " ")
    .trim();

  IDS.forEach(ID => {
    const sentido = Object.keys(ID)[0];
    const tipoDia = Object.keys(ID[sentido])[0];

    $(`#${ID[sentido][tipoDia]} td`).each((i, element) => {
      const horas = $(element)
        .text()
        .split(":");
      const data = new Date(hoje.setHours(horas[0])).setMinutes(horas[1]);
      const time = new Date(data).getTime();
      if (!isNaN(time)) {
        horario[sentido][tipoDia] = [...horario[sentido][tipoDia], time];
      }
    });
    horario[sentido][tipoDia].sort();
    horario[sentido][tipoDia] = horario[sentido][tipoDia].map(h => {
      const data = new Date(h);
      const horas =
        data.getHours() < 10 ? `0${data.getHours()}` : data.getHours();
      const minutos =
        data.getMinutes() < 10 ? `0${data.getMinutes()}` : data.getMinutes();
      return `${horas}:${minutos}`;
    });
    while (parseInt(horario[sentido][tipoDia][0].substr(0, 2)) <= 1) {
      const primeiro = horario[sentido][tipoDia].shift();
      horario[sentido][tipoDia] = [...horario[sentido][tipoDia], primeiro];
    }
  });

  const itinerario = {
    ida: [],
    volta: []
  };

  $(`#ctl00_ContentPlaceHolder1_lblItinerario`).each((i, element) => {
    const divItinerario = $(element)
      .text()
      .split("VOLTA:");

    const ida = divItinerario[0]
      .replace("IDA:", "")
      .trim()
      .split(",");
    const volta = divItinerario[1].trim().split(",");

    itinerario.ida = ida;
    itinerario.volta = volta;
  });

  const linha = {
    number,
    name,
    link,
    horario,
    itinerario
  };

  return res.send({ linha });
});

module.exports = app => app.use("/api/v1_0/bus", router);