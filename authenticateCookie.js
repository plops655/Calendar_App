import dotenv from 'dotenv'
import * as path from 'path'
import jwt from "jsonwebtoken"
import  { fileURLToPath } from 'url'

// .env config
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
    override: true,
    path: path.join(__dirname, 'development.env')
})

const authenticateCookie = (req, res, next) => {
    // Get the token from the request headers or cookies
    const token = req.cookies.token;
    try {
        const user = jwt.verify(token, process.env.JWT_SECRET)
        req.user = user
        next()
    } catch(err) {
        res.clearCookie("token")
        res.status(401).send("Unauthorized token!")
    }
}

export default authenticateCookie