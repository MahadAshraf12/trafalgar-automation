import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function runCommand(command, args, cwd, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Starting: ${description}`);
    console.log(`📂 Directory: ${cwd}`);
    console.log(`💻 Command: ${command} ${args.join(' ')}`);
    console.log('─'.repeat(50));

    const child = spawn(command, args, {
      cwd: cwd,
      stdio: 'inherit',
      shell: true
    });

    child.on('error', (error) => {
      console.error(`❌ Error in ${description}:`, error);
      reject(error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`✅ Completed: ${description}`);
        console.log('─'.repeat(50));
        resolve();
      } else {
        console.error(`❌ Failed: ${description} (exit code: ${code})`);
        reject(new Error(`${description} failed with exit code ${code}`));
      }
    });
  });
}

async function runAllPipelines() {
  console.log('🌟 TRAFALGAR AUTOMATION - MASTER PIPELINE');
  console.log('═'.repeat(50));
  console.log('This will run all four data pipelines in sequence:');
  console.log('1. Trafalgar (trafalgar/ folder)');
  console.log('2. Insight Vacations (insightvacations/ folder)');
  console.log('3. CostSaver (costsaver/ folder)');
  console.log('4. G Adventures (g_adventures/ folder)');
  console.log('');
  console.log('🧠 Memory-optimized for low-RAM VPS (512MB)');
  console.log('   - Batch processing (50 tours at a time for G Adventures)');
  console.log('   - Rate limiting and memory monitoring enabled');
  console.log('═'.repeat(50));
  console.log(`🧠 Starting memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB RSS`);

  try {
    // 1. Run Trafalgar pipeline
    await runCommand(
      'node',
      ['main.js'],
      join(__dirname, 'trafalgar'),
      'Trafalgar Pipeline'
    );

    // 2. Run Insight Vacations pipeline
    await runCommand(
      'node',
      ['main.js'],
      join(__dirname, 'insightvacations'),
      'Insight Vacations Pipeline'
    );

    // 3. Run CostSaver pipeline
    await runCommand(
      'node',
      ['main.js'],
      join(__dirname, 'costsaver'),
      'CostSaver Pipeline'
    );

    // 4. Run G Adventures pipeline
    await runCommand(
      'node',
      ['--max-old-space-size=512', 'main.js'],
      join(__dirname, 'g_adventures'),
      'G Adventures Pipeline'
    );

    console.log('\n🎉 ALL PIPELINES COMPLETED SUCCESSFULLY!');
    console.log('═'.repeat(50));
    console.log('📊 Summary:');
    console.log('✅ Trafalgar data processed and inserted');
    console.log('✅ Insight Vacations data processed and inserted');
    console.log('✅ CostSaver data processed and inserted');
    console.log('✅ G Adventures data processed and inserted');
    console.log(`🧠 Final memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB RSS`);
    console.log('═'.repeat(50));
    console.log('💡 Memory optimization tips for VPS:');
    console.log('   - Run with: node --expose-gc main.js');
    console.log('   - Monitor memory with: htop or free -h');
    console.log('   - Batch size: 5 tours, 2s delays');
    console.log('═'.repeat(50));

  } catch (error) {
    console.error('\n💥 PIPELINE FAILED!');
    console.error('Error:', error.message);
    console.log('\n🔍 Check the error messages above to identify which pipeline failed.');
    process.exit(1);
  }
}

// Run the master pipeline
runAllPipelines().catch(console.error);