import { isOllamaRunning, startOllama } from './ollama';
import { runAgentLoop } from './agent';

async function main() {
  console.log('checking if ollama is running...');
  const running = await isOllamaRunning();
  if (!running) {
    console.log('starting ollama...');
    startOllama();
    // poll until server responds — model load can take 5-15s on first boot
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await new Promise(res => setTimeout(res, 1000));
      if (await isOllamaRunning()) break;
    }
    // give the model runner a moment to initialize after the server is up
    await new Promise(res => setTimeout(res, 2000));
  }

  console.log('running agent...');
  const reply = await runAgentLoop('who is raz? and how and where did I meet him?');
  console.log('response:', reply);
}

main();
