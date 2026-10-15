# Demo 的交互与领域模型

这个网页 Demo 参考 MedTimer 的[提醒流程](https://github.com/Futsch1/medTimer/blob/main/docs/reminder_flow.md)、[Reminder](https://github.com/Futsch1/medTimer/blob/main/core/domain/src/main/java/com/futsch1/medtimer/core/domain/model/Reminder.kt)、[ReminderEvent](https://github.com/Futsch1/medTimer/blob/main/core/domain/src/main/java/com/futsch1/medtimer/core/domain/model/ReminderEvent.kt) 和[使用场景](https://github.com/Futsch1/medTimer/blob/main/docs/UseCases.md)，保留了第一版最关键的关系：

```text
药品 Medicine
  └─ 多条提醒规则 Reminder（时间、用量、星期、启停）
       └─ 某天的一次事件 ReminderEvent
            待触发 → 待处理 → 已服用 / 已跳过
                         ↘ 延后 → 待处理
```

- 计划由提醒规则按日期计算，不为每一天预存一条静态清单。停用规则后不会再产生新事件，已有事件与历史仍保留。
- 到点时创建事件；页面内的「触发下一条提醒」用于无须等待实际时间就演示同一状态转换。
- 「延后」给事件设置新的触发时间，不增加新事件，也不计为服药完成。
- 只有「已服用」扣减库存；「已跳过」不扣。改判已服用为已跳过时返还原扣减量，反向改判则扣减。
- 历史显示已经处理的事件，药品被删除后历史快照仍保留。JSON 导出包含药品、事件和操作审计信息。

网页只能在打开期间执行时间检查，不能替代 Android 的 AlarmManager、通知和后台 Worker。此 Demo 暂不实现原项目的周期疗程、间隔/关联提醒、位置延后、真实系统通知、复杂库存阈值、云同步或多设备使用。示例药品是虚构数据。
