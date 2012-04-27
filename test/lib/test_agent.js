var logger = require('../../lib/logger')
  , stats  = require('../../lib/stats')
  , trace  = require('../../lib/trace')
  ;

function StubAgent() {
    logger.setLevel('debug');

    this.transactions = [];
    this.transactionFinished = function (transaction) {
      this.transactions.push(transaction);
    };

    this.statsEngine = stats.createStatsEngine(logger);
    trace.setTransactions(this);

    this.config = require('../../lib/config').initialize(logger, {'config':{'app_name':'node.js Tests'}});

    this.version = '0.66.6';

    this.clearTransaction = function () {};

    this.environment = [];
}

exports.createAgent = function () {
  return new StubAgent();
};
