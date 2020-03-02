import request from "request";
import cheerio from "cheerio";

/*
THIS IS A BACKUP FROM AN OLD VERSION
IT WILL BE REMOVED SOON
*/

const BASE_URL = "http://www.astransp.com.br/buscaLinhas.aspx";

app.get("/linhas/number/:number", async (req, res) => {
  const number = req.params.number;
  const options = {
    url: `${BASE_URL}?linha=${number}&&TipoBusca=numero`,
    headers: {
      "User-Agent": "request",
      "Accept-Charset": "text/html; charset=utf-8",
      "Content-Type": "text/html; charset=utf-8"
    }
  };

  request(options, async (err, response, body) => {
    if (err) console.log("Erro: ", err);
    const $ = cheerio.load(body);
    let linhas = [];

    $("#ctl00_ContentPlaceHolder1_lblHorarios li a").each((i, element) => {
      let link = $(element).attr("href");
      // console.log($(element).text(), link);

      const numberAndName = $(element)
        .text()
        .replace(/\s\s+/g, " ")
        .split(" - ");
      const number = numberAndName[0].trim();
      const name = numberAndName[1].trim();

      if (number && name) {
        linhas = [...linhas, { number, name, link }];
      }
    });

    if (linhas.length === 0) {
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
        linhas[0] = {
          number,
          name,
          link
        };
      }
    }

    console.log("Sucesso");
    console.log(linhas);
    return res.send({ linhas });
  });
});

app.get("/linha/:id", async (req, res) => {
  console.log(req.params);
  const id = req.params.id;

  const options = {
    url: `${BASE_URL}?IDLinha=${id}`,
    headers: {
      "User-Agent": "request",
      "Accept-Charset": "text/html; charset=utf-8",
      "Content-Type": "text/html; charset=utf-8"
    }
  };

  request(options, async (err, response, body) => {
    if (err) console.log("Erro: ", err);
    const $ = cheerio.load(body);
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

    const linha = {
      number,
      name,
      link,
      horario,
      itinerario: ""
    };

    console.log("Sucesso");

    return res.send({ linha });
  });
});
