module.exports = {
  apps: [
    {
      name: "api-aeoz",
      script: "./src/index.js",
      exec_interpreter: "babel-node",
      watch: true,
      ignore_watch: ["node_modules", "static", "database"],
      watch_options: { followSymlinks: false },
      env: {
        PORT: "3000"
      }
    }
  ]
};
