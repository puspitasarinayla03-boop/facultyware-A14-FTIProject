const ejs = require('ejs');
const db = require('./lib/db');

async function test() {
  try {
    const [rows] = await db.query('SELECT * FROM committees WHERE id = 3');
    const project = rows[0];
    console.log('Project fetched:', project);

    ejs.renderFile('./views/projects/edit.ejs', {
      title: 'Test',
      user: 'Admin',
      project: project,
      errors: []
    }, {}, (err, str) => {
      if (err) {
        console.error('Render error:', err);
      } else {
        // Find inputs and textareas
        const nameInput = str.match(/<input[^>]*id="name"[^>]*>/);
        const descTextarea = str.match(/<textarea[^>]*id="description"[^>]*>([\s\S]*?)<\/textarea>/);
        const objectiveTextarea = str.match(/<textarea[^>]*id="objective"[^>]*>([\s\S]*?)<\/textarea>/);
        const startDateInput = str.match(/<input[^>]*id="start_date"[^>]*>/);

        console.log('--- Rendered Elements ---');
        console.log('Name Input:', nameInput ? nameInput[0] : 'Not found');
        console.log('Description Textarea:', descTextarea ? descTextarea[0] : 'Not found');
        console.log('Objective Textarea:', objectiveTextarea ? objectiveTextarea[0] : 'Not found');
        console.log('Start Date Input:', startDateInput ? startDateInput[0] : 'Not found');
      }
      process.exit(0);
    });
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

test();