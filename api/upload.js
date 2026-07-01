const { cors, json, supabase } = require('./_lib');
const Busboy = require('busboy');

const BUCKET = 'receipts';

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find(b => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: true });
  }
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    await ensureBucket();

    const { buffer, filename } = await new Promise((resolve, reject) => {
      const bb = Busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
      let fileBuffer = null;
      let fileName = '';
      bb.on('file', (fname, stream, info) => {
        fileName = `${Date.now()}-${info.filename}`;
        const chunks = [];
        stream.on('data', c => chunks.push(c));
        stream.on('end', () => { fileBuffer = Buffer.concat(chunks); });
      });
      bb.on('finish', () => {
        if (!fileBuffer || !fileName) return reject(new Error('No file'));
        resolve({ buffer: fileBuffer, filename: fileName });
      });
      bb.on('error', reject);
      req.pipe(bb);
    });

    const { data, error } = await supabase.storage.from(BUCKET).upload(filename, buffer, {
      contentType: 'image/*',
      upsert: true,
    });

    if (error) throw error;

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    return json(res, 200, { url: urlData.publicUrl });
  } catch (err) {
    console.error('upload error:', err);
    json(res, 500, { error: 'Falha ao enviar arquivo' });
  }
};
