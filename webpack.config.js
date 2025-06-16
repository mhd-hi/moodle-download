const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {  entry: {
    background: './src/background.ts',
    contentScript: './src/contentScript.ts',
    popup: './src/popup.ts'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  plugins: [    new CopyPlugin({
      patterns: [
        { from: 'src/manifest.json', to: 'manifest.json' },
        { from: 'src/popup.html', to: 'popup.html' }
      ],
    }),
  ],
  optimization: {
    splitChunks: false,
  },
  devtool: 'source-map',
};
