const SPARQL_ENDPOINT = "https://sparql.crssnky.xyz/spql/imas/query";

const query = `
PREFIX schema: <http://schema.org/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX imas: <https://sparql.crssnky.xyz/imasrdf/URIs/imas-schema.ttl#>

SELECT ?name ?birthday WHERE {
  ?idol rdf:type imas:Idol ;
        schema:name ?name ;
        schema:birthDate ?birthday ;
        imas:Brand "CinderellaGirls"@en .
  FILTER(LANG(?name) = "ja")
  FILTER(?name NOT IN ("イム・ユジン"@ja, "リュ・ヘナ"@ja))
}
ORDER BY ?birthday ?name
`;

async function fetchBirthdays() {
  const url =
    SPARQL_ENDPOINT +
    "?query=" +
    encodeURIComponent(query) +
    "&output=json";

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
  console.log("取得したアイドル一覧:");
  for (const idol of idols) {
    console.log(`- ${idol.name} (${idol.birthday.slice(2)})`);
  }

  const pairs = countBirthdayCollisions(idols);
  console.log(`誕生日が同じアイドルのペア数: ${pairs}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
