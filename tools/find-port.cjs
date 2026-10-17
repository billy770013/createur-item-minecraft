const net = require('node:net');
async function findPort(start = 5930) {
  for (let port = start; port < start + 50; port++) {
    const available = await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', error => error.code === 'EADDRINUSE' || error.code === 'EACCES' ? resolve(false) : reject(error));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error('Aucun port libre entre ' + start + ' et ' + (start + 49));
}
module.exports = { findPort };
if (require.main === module) findPort().then(port => console.log(port)).catch(error => { console.error(error.message); process.exitCode = 1; });
