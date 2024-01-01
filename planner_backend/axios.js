import axios from 'axios'

const instance = axios.create({
    baseURL: 'http://localhost:9002',
})

export default instance