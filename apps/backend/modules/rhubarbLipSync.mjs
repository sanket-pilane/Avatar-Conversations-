import { execCommand } from "../utils/files.mjs";
import { promises as fs } from "fs";
import path from "path";

const fileExists = async (p) => {
  try {
    await fs.access(p);
    return true;
  } catch (e) {
    return false;
  }
};

const checkDependencies = async () => {
  // Check ffmpeg is available on PATH
  try {
    await execCommand({ command: "ffmpeg -version" });
  } catch (e) {
    throw new Error(
      "ffmpeg not found. Please install ffmpeg and ensure it's on your PATH. On Debian/Ubuntu: sudo apt install ffmpeg; macOS: brew install ffmpeg"
    );
  }

  // Determine rhubarb path: RHUBARB_PATH env var, ./bin/rhubarb under cwd, or system `rhubarb` via which
  const envRhubarb = process.env.RHUBARB_PATH;
  const defaultLocal = path.resolve(process.cwd(), "./bin/rhubarb");
  let rhubarbPath = envRhubarb || defaultLocal;

  if (!(await fileExists(rhubarbPath))) {
    // Try system `which rhubarb`
    try {
      const whichResult = await execCommand({ command: "which rhubarb" });
      const whichPath = whichResult.trim();
      if (whichPath) {
        rhubarbPath = whichPath;
      }
    } catch (e) {
      // which not found or rhubarb not installed
    }
  }

  if (!(await fileExists(rhubarbPath))) {
    throw new Error(
      `Rhubarb binary not found. Tried paths: ${
        envRhubarb || "RHUBARB_PATH not set"
      }, ${defaultLocal}, and system PATH.\n` +
        `Download Rhubarb Lip-Sync from https://github.com/DanielSWolf/rhubarb-lip-sync/releases and place the executable in backend/bin as 'rhubarb', or install it system-wide and ensure it's on PATH. You can also set RHUBARB_PATH to the executable location.`
    );
  }

  // Return the resolved path so caller can use it if needed
  return rhubarbPath;
};

const getPhonemes = async ({ message }) => {
  try {
    const time = new Date().getTime();
    console.log(`Starting conversion for message ${message}`);

    // Validate dependencies before conversion
    await checkDependencies();

    await execCommand({
      command: `ffmpeg -y -i audios/message_${message}.mp3 audios/message_${message}.wav`,
    });
    console.log(`Conversion done in ${new Date().getTime() - time}ms`);
    const rhubarbPath = await checkDependencies();
    try {
      await execCommand({
        command: `${rhubarbPath} -f json -o audios/message_${message}.json audios/message_${message}.wav -r phonetic`,
      });
    } catch (err) {
      const errMsg = String(err.message || err);
      // If rhubarb fails due to missing PocketSphinx resources, retry without -r phonetic
      if (/PocketSphinx|cmudict|speech recognition/i.test(errMsg)) {
        console.warn(
          "Rhubarb failed due to missing PocketSphinx resources; retrying without '-r phonetic' (slower, but avoids PocketSphinx)"
        );
        try {
          await execCommand({
            command: `${rhubarbPath} -f json -o audios/message_${message}.json audios/message_${message}.wav`,
          });
        } catch (err2) {
          console.error(
            `Rhubarb fallback also failed for message ${message}:`,
            err2
          );
          throw err2;
        }
      } else {
        throw err;
      }
    }
    // -r phonetic is faster but less accurate
    console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
  } catch (error) {
    console.error(
      `Error while getting phonemes for message ${message}:`,
      error
    );
    throw error;
  }
};

export { getPhonemes };
