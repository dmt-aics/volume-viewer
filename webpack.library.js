const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    library: 'VolumeViewer',
    libraryTarget: 'umd'
  },
  resolve: {
    extensions: ['.js']
  },
  plugins: [
    new webpack.ProvidePlugin({
      THREE: 'three'
    })
  ],
  devtool: 'cheap-module-source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        include: [
          path.resolve(__dirname, 'src')
        ],
        exclude: /node_modules/,
        use: 'babel-loader'
      },
      {
        test: /Worker\.js$/,
        use: 'worker-loader?inline=true'
      }
    ]
  }
};
