# MedTimer 到微信小程序的界面与逻辑映射

参考了原项目的 [界面截图](https://github.com/Futsch1/medTimer/tree/main/docs)、[提醒生命周期](https://github.com/Futsch1/medTimer/blob/main/docs/reminder_flow.md)、[提醒规则](https://github.com/Futsch1/medTimer/blob/main/core/domain/src/main/java/com/futsch1/medtimer/core/domain/model/Reminder.kt)、[事件模型](https://github.com/Futsch1/medTimer/blob/main/core/domain/src/main/java/com/futsch1/medtimer/core/domain/model/ReminderEvent.kt) 和 [Use Cases](https://github.com/Futsch1/medTimer/blob/main/docs/UseCases.md)。小程序采用微信原生组件重建，不直接运行 Android 代码。

| 原项目 | 小程序对应界面 / 行为 |
| --- | --- |
| Overview 周视图、时间轴、状态圆点、补记按钮 | 主页周切换、时间轴、状态操作菜单、补记服药 |
| Medicines 卡片、库存、提醒时间、药品编辑 | 药品卡片、库存阈值、药品编辑与多提醒规则 |
| Reminder 编辑与高级重复规则 | 每周固定时间、周期疗程、启停和用量 |
| Analysis 图表、表格、日历、相对浓度趋势 | 近 7 / 30 天柱图、处理历史表、月历、基于半衰期和达峰时间的简化相对曲线 |
| 确认、跳过、延后、改判 | 同一事件状态变化及库存修正 |
| 我的 | 本机演示账户、药品 / 记录概览、家庭组入口和说明 |
| 家庭协助（演示新增） | 创建家庭组、生成 6 位邀请码、输入邀请码加入、查看成员 |

```text
药品 Medicine
  └─ 多条提醒规则 Reminder（时间、用量、每周 / 周期、启停）
       └─ 某天的一次事件 ReminderEvent
            待触发 → 待处理 → 已服用 / 已跳过
                         ↘ 延后 → 待处理
```

计划由规则按日期计算，不预存未来清单。到点时创建事件；「模拟触发下一条提醒」走同一状态转换，便于立即演示。延后改变同一事件下次触发时间。仅已服用会扣减库存，改判会先返还原扣减量；补记创建独立事件。历史保存事件快照，因此删除药品后仍显示已处理记录。网页和小程序使用相同的 `miniprogram/lib/model.js`。

当前是可交互原型，覆盖主路径，不等于 Android 完整功能移植。家庭组邀请码可在本机演示创建与加入流程；目前不会连接服务端核验邀请码，也不会同步家庭成员或药品设置。真实家庭协作需要账号体系、服务端邀请码、成员权限、授权流程与数据同步。另未实现 Android 后台闹钟 / 系统通知、微信订阅消息、间隔及关联提醒、位置延后、多选批量操作、导入导出或跨设备用药数据。页面中的装饰性操作栏仅还原视觉。药品与家庭组数据只在当前浏览器或小程序本机保存。真实小程序发布、服务端定时任务和订阅消息需要另行配置微信 AppID 与后端。

浓度趋势需要在药品设置里同时填写半衰期（小时）和达峰时间（小时），并有已记录的服用事件。模型以剂量和这两个参数生成各药物自身归一化的相对曲线；不同药物的曲线不用于横向比较。此图仅用于交互演示，不是药代动力学预测、真实血药浓度或医疗建议。
