// coding: utf-8
// Copyright 2017 Modoolar <info@modoolar.com>
// License LGPLv3.0 or later (https://www.gnu.org/licenses/lgpl-3.0.en.html).

odoo.define('project_agile.activity_stream', function (require) {
    "use strict";

    var data = require('project_agile.data');
    var AgileBaseWidget = require('project_agile.BaseWidgets').AgileBaseWidget;
    var core = require("web.core");
    var _t = core._t;
    var qweb = core.qweb;
    var bus = require('project_agile.core').bus;

    var ActivityStream = AgileBaseWidget.extend({
        _name: "ActivityStream",
        template: "project.agile.activity.stream",
        limit: 8,
        loadMoreStep: 8,
        emptyPlaceholder: $("<div>" + _t("There are no activities.") + "</div>"),
        init(parent, options) {
            this._super(parent, options);
            Object.assign(this, options);
            this.prepareData();
            window.as = this;
        },
        prepareData() {
            this.activitiesDeferred = $.Deferred();
            data.getMessageSubtypes("project.task").then(subtypes => {
                this.subtypes = subtypes;
                console.log("Subtypes", subtypes);
                this.subtype_ids = subtypes.map(e => e.id);

                let team_changing = (this.team_changing && this.team_changing.state() === "pending") ? this.team_changing : $.Deferred().resolve();
                team_changing.then(() => {
                    data.session.rpc("/agile/activity-stream", {subtype_ids: this.subtype_ids, limit: this.limit})
                        .then(messages => {
                            this.messagesCount = messages.length;
                            window.msgs = messages;
                            this.messages = [];
                            this.groupWeekDays = new Map();
                            if (!this.lastMessage) {
                                this.lastMessage = {};
                            }

                            this.prepareMessages(messages);
                            this.activitiesDeferred.resolve();
                        });
                });
            });
            return this.activitiesDeferred;
        },
        prepareMessages(messages) {
            this.messages.push(messages);
            messages.forEach(m => {
                let weekday = this.formatGroupWeekDay(m.date);
                this.groupWeekDays.has(weekday) ?
                    this.isSameAuthor(m, this.lastMessage) ? this.lastGroup.push(m) : this.groupWeekDays.get(weekday).push(this.lastGroup = [m]) :
                    this.groupWeekDays.set(weekday, [this.lastGroup = [m]]);
                this.lastMessage = m;
            });
        },
        loadMore() {
            this.$(".list-preloader").show();
            this.limit += this.loadMoreStep;
            this.prepareData();
            this.activitiesDeferred.then(() => {
                this.renderElement();
                this.start();
            });
        },
        start() {
            this.$(".message-body").expander({
                slicePoint: 140,
                expandEffect: "fadeIn",
                collapseEffect: "fadeOut"
            });

            this.$(".load-more-btn").click(this.loadMore.bind(this));
        },

        renderElement() {
            this._super();
            this.$(".load-more-btn").hide();
            // Adding backlog task list
            this.activitiesDeferred.then(() => {
                this.$(".list-preloader").hide();
                if (this.messagesCount > 0 && this.limit <= this.messagesCount) {
                    this.$(".load-more-btn").show();
                }
                for (let [weekdayGroup, activityGroups] of this.groupWeekDays) {
                    // Append week-day (Yesterday, Monday, Sunday, etc.)
                    this.$(".activity").append($(`<div class="activity-date">${weekdayGroup}</div>`));
                    for (let activityGroup of activityGroups) {
                        // Render and append activity Group (Activities by he same author will be grouped)
                        let author = this.getAuthor(activityGroup[0]);
                        let groupNode = $(qweb.render("project.agile.activity.group", {author}));
                        this.$(".activity").append(groupNode);
                        let activityGroupContent = groupNode.find(".activity-group-content");
                        console.log("Group:", this.getAuthor(activityGroup[0]));
                        for (let message of activityGroup) {
                            // Render activities in group
                            let messageNode = $(qweb.render("project.agile.activity.item", {widget: this, message}));
                            messageNode.find(".activity-object").click(e => {
                                e.preventDefault();
                                e.stopPropagation();
                                var objectModel = $(e.currentTarget).attr("object-model");
                                var objectId = $(e.currentTarget).attr("object-id");
                                switch (objectModel) {
                                    case "project.task":
                                        hash_service.setHash("task", objectId, false);
                                        hash_service.setHash("view", "task", false);
                                        hash_service.setHash("page", "board");
                                        break;
                                }
                            });
                            activityGroupContent.append(messageNode);
                            // console.log("Message:", message);
                        }
                    }
                }
                if (this.groupWeekDays.size) {
                    this.$el.removeClass("empty");
                }
                console.log(this.groupWeekDays);
            });
            if (this.emptyPlaceholder) {
                this.emptyPlaceholder.addClass("empty-placeholder");
                this.$el.append(this.emptyPlaceholder);
                this.$el.addClass("empty");
            }
        },
        isSameAuthor(m1, m2) {
            if (m1.create_uid != undefined && m2.create_uid){
                if (Array.isArray(m1.create_uid) && Array.isArray(m2.create_uid)){
                    return m1.create_uid[0] === m2.create_uid[0]
                } else {
                    return m1.create_uid.id === m2.create_uid.id
                }
            } else {
                return m1.email_from === m2.email_from;
            }
        },
        getAuthor(message) {
            return {
                name: message.create_uid ? message.create_uid[1] : message.email_from,
                image: data.getImage("res.users", message.create_uid ? message.create_uid[0] : 0)
            }
        },
        timeFormat: {
            sameDay: '[Today at] HH:MM',
            lastDay: '[Yesterday at] HH:MM',
            lastWeek: 'dddd [at] HH:MM',
            sameElse: 'DD/MM/YYYY [at] HH:MM'
        },
        formatTime(time) {
            return moment(time).calendar(null, this.timeFormat);
        },
        groupWeekDayFormat: {
            sameDay: '[Today]',
            lastDay: '[Yesterday]',
            lastWeek: 'dddd',
            sameElse: '[Older]'
        },
        formatGroupWeekDay(time) {
            return moment(time).calendar(null, this.groupWeekDayFormat);
        },
        getActivityType(message) {

            //TODO: Rewrite and add support for multilanguage.
            let isCommit = message.subtype_id && message.subtype_id[1] === "Code committed";
            let isComment = message.message_type === "comment";
            return {
                subtype: message.subtype_id && {id: message.subtype_id[0], name: message.subtype_id[1]},
                isCommit,
                message: isCommit ? "Code pushed" :
                    isComment ? "commented" :
                        message.subtype_id ? message.subtype_id[1] : "commented"
            }
        },
        readSubscriptions() {

        }
    });

    return {
        ActivityStream
    };
});