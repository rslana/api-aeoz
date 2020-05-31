module.exports = {
  apps: [
    {
      name: "api-jfbus",
      script: "./src/index.js",
      exec_interpreter: "babel-node",
      watch: true,
      ignore_watch: ["node_modules", "static", "database", "logs"],
      watch_options: { followSymlinks: false },
      env: {
        PORT: "3030"
      }
    }
  ]
};
