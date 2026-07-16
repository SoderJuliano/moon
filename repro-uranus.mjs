// Repro: spawn da nave em Urano (modo real). Mede nave/câmera vs raio do planeta.
import { chromium } from "playwright";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fast = process.argv.includes("--fast-w"); // aperta W durante o tween da câmera

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text()); });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto("http://localhost:5199/", { waitUntil: "load" });
await page.waitForSelector(".thumb", { timeout: 20000 });
await wait(2500); // primeira renderização + assets

// modo REAL
await page.click("button[data-mode]");
await wait(7000); // transição de escala/órbita assenta

// foca Urano
await page.click('.thumb[data-id="uranus"]');
await wait(fast ? 400 : 3000); // --fast-w: W no MEIO do tween (1.2s)

console.log("antes do W :", JSON.stringify(await page.evaluate(() => window.__dbg("uranus"))));
await page.keyboard.down("KeyW");
await wait(150);
await page.keyboard.up("KeyW");

for (let i = 0; i < 12; i++) {
  await wait(500);
  const d = await page.evaluate(() => window.__dbg("uranus"));
  const inside = d.distShip < d.body.radius ? " << NAVE DENTRO" : "";
  const camIn = d.distCam < d.body.radius ? " << CÂMERA DENTRO" : "";
  console.log(
    `t=${((i + 1) * 0.5).toFixed(1)}s r=${d.body.radius} nave=${d.distShip}${inside} cam=${d.distCam}${camIn}` +
    ` intro=${d.ship.intro} tween=${d.tweening} explodindo=${d.ship.exploding}`
  );
  if (i === 1 || i === 5) await page.screenshot({ path: `/tmp/uranus-${fast ? "fast-" : ""}t${i}.png` });
}
await browser.close();
