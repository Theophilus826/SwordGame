
const { spawn } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;
const fs = require("fs");
const path = require("path");

const logoPath = path.join(__dirname, "../assets/logo.png");

const EFFECTS = {
  original: "null",
  cinematic: "eq=contrast=1.12:saturation=1.18:brightness=0.02",
  vibrant: "eq=contrast=1.06:saturation=1.35",
  bw: "hue=s=0,eq=contrast=1.12",
  vintage:
    "eq=contrast=1.05:saturation=0.78:brightness=0.025,colorbalance=rs=0.06:gs=0.02:bs=-0.04",
};

function getDuration(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffprobePath, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      input,
    ]);

    let output = "";

    child.stdout.on("data", chunk => {
      output += chunk;
    });

    child.on("error", reject);

    child.on("close", code => {
      const duration = Number(output.trim());

      if (code !== 0 || !Number.isFinite(duration) || duration <= 0) {
        return reject(new Error("Unable to read video duration"));
      }

      resolve(duration);
    });
  });
}

async function watermarkVideo(input, output, effect = "original") {
  if (!fs.existsSync(logoPath)) {
    throw new Error("Logo missing: place your logo at assets/logo.png");
  }

  if (!Object.prototype.hasOwnProperty.call(EFFECTS, effect)) {
    throw new Error("Unsupported video effect");
  }

  const duration = await getDuration(input);
  const outroStart = Math.max(3, duration - 3);

  const filter = [
    // Apply the selected effect before adding the logo.
    `[0:v]${EFFECTS[effect]}[processed]`,

    // Prepare small and large versions of the transparent logo.
    "[1:v]scale=120:-1[small]",
    "[1:v]scale=280:-1[large]",

    // Small logo only between the intro and outro.
    `[processed][small]overlay=W-w-24:24:enable='gte(t,3)*lt(t,${outroStart})'[base]`,

    // Large logo for the first and last three seconds.
    `[base][large]overlay=W-w-24:24:enable='lt(t,3)+gte(t,${outroStart})'[v]`,
  ].join(";");

  await new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, [
      "-y",
      "-i", input,
      "-i", logoPath,
      "-filter_complex", filter,
      "-map", "[v]",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-c:a", "aac",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      output,
    ]);

    let errors = "";

    child.stderr.on("data", chunk => {
      errors += chunk;
    });

    child.on("error", reject);

    child.on("close", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(errors.slice(-3000) || "FFmpeg processing failed")
        );
      }
    });
  });
}

module.exports = watermarkVideo;
