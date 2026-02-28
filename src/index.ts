import express from "express";
import identifyRouter from "./routes/identify";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (_req, res) => {
    res.json({ message: "Bitespeed Identity Reconciliation Service" });
});

app.use("/identify", identifyRouter);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export default app;
