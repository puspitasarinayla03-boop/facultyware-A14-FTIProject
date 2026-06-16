// tests/run-setup.js
// Script helper untuk menjalankan global-setup secara manual (test DB setup)
require('./global-setup.js')()
  .then(() => {
    console.log('✅ Setup selesai!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Setup gagal:', err.message);
    process.exit(1);
  });
