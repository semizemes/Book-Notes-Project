import 'dotenv/config';
import express from "express";
import pg from "pg";
import axios from "axios";

// Database configuration using environment variables
const db = new pg.Client({
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

// Connect to database with error handling
async function connectDB() {
  try {
    await db.connect();
    console.log('Connected to PostgreSQL database');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

connectDB();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Utility function to get books with sorting
async function booksArr(sort = 'newest') {
  try {
    let query = "SELECT * FROM books ORDER BY time DESC"; // default

    switch(sort) {
      case "best":
        query = "SELECT * FROM books ORDER BY my_rate DESC";
        break;
      case 'newest':
        query = "SELECT * FROM books ORDER BY time DESC";
        break;
      case 'title':
        query = "SELECT * FROM books ORDER BY name ASC";
        break;
    }

    const result = await db.query(query);

    // Convert binary image data to base64
    const books = result.rows.map(book => {
      if (book.images) {
        book.images = book.images.toString('base64');
      }
      return book;
    });

    return books;
  } catch (error) {
    console.error('Error fetching books:', error);
    throw error;
  }
}

// Utility function to validate ISBN
function validateISBN(isbn) {
  // Basic ISBN validation (10 or 13 digits, possibly with hyphens)
  const cleanISBN = isbn.replace(/[-\s]/g, '');
  return /^\d{10}$|^\d{13}$/.test(cleanISBN);
}

// Routes
app.get("/", async (req, res) => {
  try {
    const books = await booksArr(req.query.sort);
    const message = req.query.msg || "";

    res.render("index.ejs", {
      results: books,
      messageSQL: message,
    });
  } catch (error) {
    console.error("Error in GET /:", error);
    res.status(500).render("index.ejs", {
      results: [],
      messageSQL: "Error loading books. Please try again.",
    });
  }
});

app.post("/new", async (req, res) => {
  let message = "";

  try {
    const { bName: bookName, isbn: bookISBN, text: myThought, myRate: rate } = req.body;

    // Validation
    if (!bookName || !bookISBN || !rate) {
      message = "Please fill in all required fields.";
      throw new Error("Missing required fields");
    }

    if (!validateISBN(bookISBN)) {
      message = "Please enter a valid ISBN.";
      throw new Error("Invalid ISBN format");
    }

    // Fetch book cover
    let images = null;
    try {
      const response = await axios.get(
          `https://covers.openlibrary.org/b/isbn/${bookISBN}-M.jpg`,
          {
            responseType: "arraybuffer",
            timeout: 10000 // 10 second timeout
          }
      );
      images = response.data;
    } catch (axiosError) {
      console.log("Could not fetch book cover:", axiosError.message);
      // Continue without image - this is not a critical error
    }

    const currentTime = new Date().toISOString();

    await db.query(
        `INSERT INTO books (name, isbn, time, my_rate, images, text) VALUES ($1, $2, $3, $4, $5, $6)`,
        [bookName, bookISBN, currentTime, parseInt(rate), images, myThought || '']
    );

    message = "Book has been added successfully!";

  } catch (error) {
    console.error("Error adding book:", error);
    if (!message) {
      message = "There was an error adding the book. Please try again.";
    }
  }

  try {
    const books = await booksArr();
    res.render("index.ejs", {
      results: books,
      messageSQL: message,
    });
  } catch (error) {
    res.status(500).render("index.ejs", {
      results: [],
      messageSQL: "Error loading books after addition.",
    });
  }
});

// Route for adding/updating text to existing books
app.get('/add', (req, res) => {
  res.render('isbn.ejs', { messageSQL: "" });
});

app.post("/isbn", async (req, res) => {
  let message = "";

  try {
    const { isbn: bookISBN, text: myThought } = req.body;

    if (!bookISBN || !validateISBN(bookISBN)) {
      message = "Please enter a valid ISBN.";
      throw new Error("Invalid ISBN");
    }

    if (!myThought) {
      message = "Please enter your thoughts about the book.";
      throw new Error("Missing text");
    }

    const result = await db.query(
        `UPDATE books SET text = $1 WHERE isbn = $2`,
        [myThought, bookISBN]
    );

    if (result.rowCount === 0) {
      message = "No book found with that ISBN.";
    } else {
      message = "Text has been added successfully!";
    }

  } catch (error) {
    console.error("Error updating book text:", error);
    if (!message) {
      message = "There was an error updating the book. Please try again.";
    }
  }

  try {
    const books = await booksArr();
    res.render("index.ejs", {
      results: books,
      messageSQL: message,
    });
  } catch (error) {
    res.status(500).render("index.ejs", {
      results: [],
      messageSQL: "Error loading books after update.",
    });
  }
});

// Health check endpoint for deployment platforms
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Handle 404 errors
app.use((req, res) => {
  res.status(404).render('index.ejs', {
    results: [],
    messageSQL: 'Page not found.'
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).render('index.ejs', {
    results: [],
    messageSQL: 'An unexpected error occurred.'
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  try {
    await db.end();
    console.log('Database connection closed.');
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});