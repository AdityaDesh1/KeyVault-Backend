const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");
const mysql = require("mysql2");
const cors = require("cors");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);

const app = express();
const port = 3002;

// CORS configuration
app.use(
  cors({
    origin: "http://127.0.0.1:5502", // Replace with your frontend URL
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

// Database connection setup
const db = mysql.createConnection({
  host: "sql12.freesqldatabase.com",
  user: "sql12763637",
  password: "8P2tpcdIAT@",
  database: "sql12763637",
  multipleStatements: true // Allow multiple queries if needed
});

db.connect((err) => {
  if (err) {
    console.error("❌ Error connecting to the database:", err.message);
    return;
  }
  console.log("✅ Connected to the MySQL database.");
});


// MySQL session store
const sessionStore = new MySQLStore({}, db);

// Session configuration
app.use(
  session({
    key: "session_cookie_name",
    secret: "your_secret_key",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup upload folder
const UPLOAD_FOLDER = "./uploads";
if (!fs.existsSync(UPLOAD_FOLDER)) {
  fs.mkdirSync(UPLOAD_FOLDER);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_FOLDER);
  },
  filename: (req, file, cb) => {
    const uniqueKey = uuidv4();
    const fileExtension = path.extname(file.originalname);
    cb(null, uniqueKey + fileExtension);
    req.fileKey = uniqueKey;
  },
});

const upload = multer({ storage: storage });

// Middleware to check if user is logged in
function isAuthenticated(req, res, next) {
  console.log("Checking session in isAuthenticated middleware:", req.session);
  if (req.session.user) {
    console.log("User is authenticated:", req.session.user);
    next();
  } else {
    console.log("User is not authenticated");
    res.status(403).json({ message: "Please log in to upload files" });
  }
}

// Login route
app.post("/login", (req, res) => {
  const { usernameOrEmail, password } = req.body;
  const sql =
    "SELECT * FROM users WHERE (username = ? OR email = ?) AND password = ?";

  db.query(
    sql,
    [usernameOrEmail, usernameOrEmail, password],
    (err, results) => {
      if (err) return res.status(500).json({ message: "Database error" });

      if (results.length > 0) {
        req.session.user = results[0];
        req.session.save((err) => {
          if (err) console.error("Session save error:", err);
          console.log("User session after login:", req.session);
          res.json({ success: true, message: "Login successful" });
        });
      } else {
        res
          .status(401)
          .json({ success: false, message: "Invalid credentials" });
      }
    }
  );
});

// SignUp route
app.post("/signup", (req, res) => {
  const { email, fullname, username, password } = req.body;
  const checkUserSql = "SELECT * FROM users WHERE username = ? OR email = ?";

  db.query(checkUserSql, [username, email], (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });

    if (results.length > 0) {
      return res.json({
        success: false,
        message: "Username or email already exists",
      });
    }

    const insertUserSql =
      "INSERT INTO users (email, fullname, username, password) VALUES (?, ?, ?, ?)";
    db.query(insertUserSql, [email, fullname, username, password], (err) => {
      if (err) return res.status(500).json({ message: "Database error" });

      res.json({ success: true });
    });
  });
});

// Upload route
app.post("/upload", isAuthenticated, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }

  const sql = "INSERT INTO files (filename, filekey) VALUES (?, ?)";
  const values = [req.file.filename, req.fileKey];

  db.query(sql, values, (err, result) => {
    if (err) return res.status(500).send("Database error: " + err.message);

    res.json({
      message: "File uploaded successfully!",
      filename: req.file.filename,
      uniqueKey: req.fileKey,
    });
  });
});

// Download route
app.get("/download/:filekey", (req, res) => {
  const fileKey = req.params.filekey;
  const sql = "SELECT filename FROM files WHERE filekey = ?";

  db.query(sql, [fileKey], (err, results) => {
    if (err) return res.status(500).send("Database error:" + err.message);

    if (results.length === 0) {
      return res.status(404).send("File not found");
    }

    const filename = results[0].filename;
    const filepath = path.join(UPLOAD_FOLDER, filename);

    fs.access(filepath, fs.constants.F_OK, (err) => {
      if (err) return res.status(404).send("File not found");

      res.download(filepath, filename, (err) => {
        if (err) res.status(500).send("Error downloading file.");
      });
    });
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
