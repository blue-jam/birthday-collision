const SPARQL_ENDPOINT = "https://sparql.crssnky.xyz/spql/imas/query";

const query = `
PREFIX schema: <https://schema.org/>
PREFIX imas: <https://sparql.crssnky.xyz/imasrdf/RDFs/detail/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX imas-schema: <https://sparql.crssnky.xyz/imasrdf/imas-schema.ttl#>

SELECT ?name ?birthday WHERE {
  ?idol rdf:type imas-schema:Idol ;
        schema:name ?name ;
        schema:birthDate ?birthday ;
        imas-schema:title ?title .
  FILTER(CONTAINS(?title, "シンデレラガールズ"))
}
`;

async function fetchBirthdays() {
  const url =
    SPARQL_ENDPOINT +
    "?query=" +
    encodeURIComponent(query) +
    "&format=json";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }
  const data = await response.json();
  return data.results.bindings.map((b) => ({
    name: b.name.value,
    birthday: b.birthday.value,
  }));
}

function countBirthdayCollisions(idols) {
  const birthdayMap = new Map();
  for (const idol of idols) {
    const key = idol.birthday;
    birthdayMap.set(key, (birthdayMap.get(key) ?? 0) + 1);
  }

  let pairs = 0;
  for (const count of birthdayMap.values()) {
    if (count >= 2) {
      pairs += (count * (count - 1)) / 2;
    }
  }
  return pairs;
}

async function main() {
  const idols = await fetchBirthdays();
  console.log(`取得したアイドル数: ${idols.length}`);

  const pairs = countBirthdayCollisions(idols);
  console.log(`誕生日が同じアイドルのペア数: ${pairs}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
