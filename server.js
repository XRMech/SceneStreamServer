const express = require('express');
const multer = require('multer');
const { RTCPeerConnection } = require('wrtc');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const port = 3000;

// MongoDB setup
mongoose.connect('mongodb://localhost:27017/imageDB', { useNewUrlParser: true, useUnifiedTopology: true });

const imageSchema = new mongoose.Schema({
  filename: String,
  timestamp: { type: Date, default: Date.now },
  event: String
});

const Image = mongoose.model('Image', imageSchema);

app.use(express.json());

// Serve static files
app.use(express.static('public'));

// Set up storage for image uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Endpoint for image upload
app.post('/upload-image', upload.single('image'), (req, res) => {
  const imgBuffer = req.file.buffer;
  const filename = `frame-${Date.now()}.jpg`;

  fs.writeFile(path.join(__dirname, 'uploads', filename), imgBuffer, (err) => {
    if (err) {
      console.error('Error saving file:', err);
      res.status(500).send('Server Error');
      return;
    }

    const newImage = new Image({
      filename: filename,
      event: req.body.event
    });

    newImage.save((err) => {
      if (err) {
        console.error('Error saving to database:', err);
        res.status(500).send('Database Error');
        return;
      }

      res.status(200).send('File uploaded and saved');
    });
  });
});

// Endpoint to clear all data and images
app.post('/clear-data', async (req, res) => {
  try {
    // Clear MongoDB collection
    await Image.deleteMany({});

    // Remove all files in the uploads directory
    const uploadsDir = path.join(__dirname, 'uploads');
    fs.readdir(uploadsDir, (err, files) => {
      if (err) throw err;

      for (const file of files) {
        fs.unlink(path.join(uploadsDir, file), err => {
          if (err) throw err;
        });
      }
    });

    res.status(200).send('All data and images cleared');
  } catch (error) {
    console.error('Error clearing data:', error);
    res.status(500).send('Error clearing data');
  }
});

// WebRTC setup for video streaming
let pc = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});

let videoStream;

pc.ontrack = (event) => {
  videoStream = event.streams[0];
  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '22',
    '-y',
    path.join(__dirname, `output-${Date.now()}.mp4`)
  ]);

  videoStream.on('data', (chunk) => {
    ffmpeg.stdin.write(chunk);
  });

  videoStream.on('end', () => {
    ffmpeg.stdin.end();
  });
};

app.post('/offer', async (req, res) => {
  const offer = req.body;
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  res.json(pc.localDescription);
});

pc.onicecandidate = (event) => {
  if (event.candidate) {
    // Handle ICE candidate
  }
};

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
