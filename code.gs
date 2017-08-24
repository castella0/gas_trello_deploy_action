/**
var config = {

  TRELLO_APP_KEY: "XXXXXXXXXXXXXXXXXXXXXXXX",
  TRELLO_TOKEN: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",

  TRELLO_LIST: {
    waiting: "XXXXXXXXXXXXXXXXXXXXXXXXX",
    complete: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  },

  TRELLO_API: {
    get_cards : "https://api.trello.com/1/lists/{list_id}/cards?key={app_key}&token={token}",
    update_card : "https://api.trello.com/1/cards/{card_id}?key={app_key}&token={token}"
  },

  TRELLO_LABEL_ID: {
    IF_DEBUG: "XXXXXXXXXXXXXXXXXXXXXXXXX",
  },


  CW_ENDPOINT: {
    rooms: 'https://api.chatwork.com/v2/rooms/'
  },
  CW_TOKEN: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  CW_ROOM_ID: 'XXXXXXXXX',

  CW_COMMAND: ['deploy'],
  CW_END_COMMAND: ['done'],

  MSG_TEXT: {
    start: 'deploy start',
    target_not_exists: 'not exists',
    end: 'deploy done',
    complete: 'complete',
  },

  CACHE_KEY: {
    last_message_id: 'LAST_MESSAGE_ID',
    last_post_card_ids: 'LAST_POST_CARD_IDS',
  },

};

var  CHECK_LABEL = {
  full: {
    need_labels: [],
    ng_labels: [
      config.TRELLO_LABEL_ID.IF_DEBUG,
    ],
  }
};


function myFunction() {

  var reflect_info = checkChatworkRequestMsg();
  if (!reflect_info) return;

  if ("done" == reflect_info.reflect_target) {
    moveCardToCompleteList(reflect_info);
  } else {
    postTargetCardsInfo(reflect_info);
  }

}
**/


// チャットワークにカードのタイトルを投稿する
function postTargetCardsInfo(reflect_info) {

  var option = {
    method: "get"
  }
  var url = config.TRELLO_API.get_cards.replace("{list_id}", config.TRELLO_LIST.waiting);
  url = url.replace("{app_key}", config.TRELLO_APP_KEY);
  url = url.replace("{token}", config.TRELLO_TOKEN);

  var response = UrlFetchApp.fetch(url, option);
  var cards = JSON.parse(response.getContentText("UTF-8"));

  var extract_cards = extractCards(cards, reflect_info.check_label)

  var body = "";
  if (extract_cards && 0 < extract_cards.length) {
    body += "[code]\n";
    body += "[info]";
    extract_cards.forEach(function(value, index) {
      body += "・" + titleCleaner(value.name) + "\n";
    });
    body += "[/info]";
    body += config.MSG_TEXT.start;
    body += "\n[/code]";
  } else {
    body += config.MSG_TEXT.target_not_exists;
  }

  postChatwork(
    config.CW_ENDPOINT.rooms + config.CW_ROOM_ID + '/messages',
    body,
    reflect_info.msg);

  setCachePostCards(extract_cards);
}


// カードを反映完了リストに移動する
function moveCardToCompleteList(reflect_info) {

  var cache = CacheService.getScriptCache();
  var target_card_ids = cache.get(config.CACHE_KEY.last_post_card_ids);

  if (target_card_ids) {
    cache.remove(config.CACHE_KEY.last_post_card_ids);
    target_card_ids = target_card_ids.split(",");

  } else {
    target_card_ids = [];

  }

  var moved_cards_title = [];
  target_card_ids.forEach(function(card_id) {
    var moved_card = moveCard(config.TRELLO_LIST.complete, card_id);
    moved_cards_title.push(titleCleaner(moved_card.name));
  });

  var body = "";
  if (moved_cards_title.length) {
    body += "[code]\n";
    body += "[info]";
    moved_cards_title.forEach(function(title) {
      body += "・" + title + "\n";
    });
    body += "[/info]";
    body += config.MSG_TEXT.end;
    body += "\n[/code]\n";
    body += config.MSG_TEXT.complete;
  } else {
    body += config.MSG_TEXT.target_not_exists;
  }

  postChatwork(
    config.CW_ENDPOINT.rooms + config.CW_ROOM_ID + '/messages',
    body,
    reflect_info.msg);

}


// チャットワークのメッセージを確認し、実行するアクションを決定する
function checkChatworkRequestMsg() {

  var result = null;

  // 投稿を取得
  var msgs = UrlFetchApp.fetch(config.CW_ENDPOINT.rooms + config.CW_ROOM_ID + '/messages?force=1', {
    headers: {
      'X-ChatWorkToken': config.CW_TOKEN
    },
    method: 'get'
  });
  if (null == msgs || '' == msgs ) return result;

  msgs = JSON.parse( msgs );
  if (msgs.length < 1) return result;

  var target_msgs = [];
  // キャッシュに、前回取得した際の最新メッセージが残っている
  var cache = CacheService.getScriptCache();
  var last_message_id = cache.get(config.CACHE_KEY.last_message_id);

  if (last_message_id) {
    var pass_last_message = false;
    msgs.forEach(function(value, index) {
      if (pass_last_message) {
        target_msgs.push(value);
      }
      if (value.message_id == last_message_id) {
        // 前回の最新メッセージより新しいものから先が今回の対象
        pass_last_message = true;
      }
    });
  }

  if (!target_msgs.length) {
    target_msgs[0] = msgs[msgs.length-1];
  }

  var target_msg = null;
  for (var i = 0, tmsgs_len = target_msgs.length; i < tmsgs_len; i++) {
    var target_msg = target_msgs[i];
    var check_strs = target_msg.body.split(/(\s+|　+)/);

    for (var i2 = 0, check_len = check_strs.length; i2 < check_len; i2++) {
      if ( 0 <= config.CW_COMMAND.indexOf( check_strs[i2] )) {

        for (var i3 = 0; i3 < check_len; i3++) {

          if ( 0 <= config.CW_END_COMMAND.indexOf( check_strs[i3] )) {
            result = {
              reflect_target: "done",
              check_label: null,
              msg: target_msg
            };
            break;

          } else {

            var check_label = CHECK_LABEL[check_strs[i3]];
            if (check_label) {
              result = {
                reflect_target: check_strs[i3],
                check_label: check_label,
                msg: target_msg
              };
              break;
            }

          }

        }

        if (!result) {
          result = {
            reflect_target: "full",
            check_label: CHECK_LABEL.full,
            msg: target_msg
          };
        }
      }

      if (result) {
        break;
      }

    }

    if (result) {
      break;
    }

  }

  if (result) {
    cache.put(config.CACHE_KEY.last_message_id, target_msg.message_id, 3600);
  }

  return result;
}


// 指定された条件に一致するカードを抽出する
function extractCards(cards, check_label) {
  var result = [];
  cards.forEach(function(card) {
    var is_need = false;
    var is_ng = false;
    card.idLabels.forEach(function(label_id) {
      is_need = is_need || (0 == check_label.need_labels.length || 0 <= check_label.need_labels.indexOf(label_id));
      is_ng = is_ng || (0 <= check_label.ng_labels.indexOf(label_id))
    });
    if (is_need && !is_ng) {
      result.push(card);
    }
  });
  return result;
}


// 今回返答したカードの一覧情報をキャッシュに保存しておく
function setCachePostCards(cards) {

  var card_ids = [];
  cards.forEach(function(card) {
    card_ids.push(card.id);
  });

  var cache = CacheService.getScriptCache();
  cache.put(config.CACHE_KEY.last_post_card_ids, card_ids.join(","), 3600);
}


// リストにカードを移動する
function moveCard(list_id, card_id) {

  var payload = {
    idList: list_id,
  };
  var option = {
    method: "put",
    payload: payload,
  };
  var url = config.TRELLO_API.update_card.replace("{card_id}", card_id);
  url = url.replace("{app_key}", config.TRELLO_APP_KEY);
  url = url.replace("{token}", config.TRELLO_TOKEN);

  var response = UrlFetchApp.fetch(url, option);
  return JSON.parse(response.getContentText("UTF-8"));
}


// チャットワークに投稿
function postChatwork(url, body, target_msg) {

  var post_body = "[rp aid=" + target_msg.account.account_id + " to=" + config.CW_ROOM_ID + "-" + target_msg.message_id + "]" + target_msg.account.name + "\n";
  post_body += body;

  UrlFetchApp.fetch(url, {
    headers: {
      'X-ChatWorkToken': config.CW_TOKEN
    },
    method: 'post',
    payload: 'body=' + encodeURIComponent( post_body )
  });

}


// タイトルの文字列から余計なものを除去する
function titleCleaner(title) {

  var reg = /^\(.*\)/;
  title = title.replace(reg, '');

  reg = /\[.*\]$/;
  title = title.replace(reg, '');

  return title.trim();
}